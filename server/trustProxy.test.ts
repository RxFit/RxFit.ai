/**
 * Proves the rate limiters key each visitor separately behind the hosting
 * proxy (server/trustProxy.ts + wiring in server/index.ts).
 *
 * The real deployment has one reverse proxy in front of Express, so the
 * tests simulate it: the test client connects from 127.0.0.1 (playing the
 * proxy) and the RIGHTMOST X-Forwarded-For entry is what that proxy would
 * append — the real client socket address. Entries left of it are
 * attacker-supplied header content.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import express from "express";
import type { Server } from "http";
import { applyTrustProxy, TRUST_PROXY_HOPS } from "./trustProxy";
import { createCheckoutRateLimit } from "./checkoutRoute";

async function withApp(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  applyTrustProxy(app);
  app.post("/api/stripe/checkout", createCheckoutRateLimit(), (req, res) => {
    res.status(200).json({ ip: req.ip });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const { port } = server.address() as { port: number };
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(baseUrl: string, xff: string) {
  return fetch(`${baseUrl}/api/stripe/checkout`, {
    method: "POST",
    headers: { "X-Forwarded-For": xff },
  });
}

describe("trust proxy configuration", () => {
  it("trusts exactly one hop — never `true` (leftmost XFF would be attacker-controlled)", () => {
    expect(TRUST_PROXY_HOPS).toBe(1);
    const app = express();
    applyTrustProxy(app);
    expect(app.get("trust proxy")).toBe(1);
  });

  it("server/index.ts applies trust proxy to the real app before routes register", () => {
    const src = readFileSync(join(__dirname, "index.ts"), "utf8");
    expect(src).toMatch(/import\s*\{\s*applyTrustProxy\s*\}\s*from\s*["']\.\/trustProxy["']/);
    const applyIdx = src.indexOf("applyTrustProxy(app)");
    const routesIdx = src.indexOf("registerRoutes(");
    expect(applyIdx).toBeGreaterThan(-1);
    expect(routesIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeLessThan(routesIdx);
  });
});

describe("per-visitor rate-limit buckets behind the proxy", () => {
  it("two different client IPs get independent buckets", async () => {
    await withApp(async (baseUrl) => {
      // Client A exhausts its 10-request budget.
      for (let i = 1; i <= 10; i++) {
        const res = await post(baseUrl, "203.0.113.10");
        expect(res.status, `client A request #${i}`).toBe(200);
        expect((await res.json()).ip).toBe("203.0.113.10");
      }
      expect((await post(baseUrl, "203.0.113.10")).status).toBe(429);

      // Client B is unaffected — its own fresh bucket.
      const b = await post(baseUrl, "198.51.100.7");
      expect(b.status).toBe(200);
      expect((await b.json()).ip).toBe("198.51.100.7");
    });
  });

  it("spoofed X-Forwarded-For entries cannot mint fresh buckets to bypass the limit", async () => {
    await withApp(async (baseUrl) => {
      // Attacker at 203.0.113.66 prepends a different fake IP on every
      // request; the proxy appends the real socket IP as the rightmost
      // entry. With one trusted hop, only that rightmost entry counts.
      for (let i = 1; i <= 10; i++) {
        const res = await post(baseUrl, `10.0.0.${i}, 203.0.113.66`);
        expect(res.status).toBe(200);
        expect((await res.json()).ip).toBe("203.0.113.66");
      }
      // 11th request with yet another spoofed prefix is still limited.
      expect((await post(baseUrl, "10.9.9.9, 203.0.113.66")).status).toBe(429);
    });
  });
});
