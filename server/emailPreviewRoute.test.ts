/**
 * Guards the admin email-preview endpoint contract:
 *  - unauthenticated (wrong/missing/unset admin key) → 401, never renders
 *  - authorized → JSON { templates } covering EVERY EMAIL_TEMPLATES entry,
 *    rendered with sample data (SAMPLE_PROBE appears in the HTML — never
 *    real lead data)
 *  - a throwing renderer → 500 with a generic message (no detail leak)
 *  - wiring: routes.ts registers GET /api/internal/email-previews via the
 *    factory, so the guarded handler can't silently revert to an inline one
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  createEmailPreviewsHandler,
  renderAllEmailPreviews,
  renderAllSmsPreviews,
  SAMPLE_PROBE,
} from "./emailPreviewRoute";
import { EMAIL_TEMPLATES, SMS_TEMPLATES } from "./emailService";

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const reqWithKey = (key?: string) =>
  ({ headers: key === undefined ? {} : { "x-admin-key": key } }) as any;

const ORIGINAL_KEY = process.env.ADMIN_API_KEY;

beforeEach(() => {
  process.env.ADMIN_API_KEY = "test-admin-key";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = ORIGINAL_KEY;
});

describe("createEmailPreviewsHandler auth", () => {
  it("returns 401 with a wrong key and never calls the renderer", () => {
    const renderPreviews = vi.fn();
    const handler = createEmailPreviewsHandler({ renderPreviews });
    const res = mockRes();
    handler(reqWithKey("wrong"), res);
    expect(res.statusCode).toBe(401);
    expect(renderPreviews).not.toHaveBeenCalled();
  });

  it("returns 401 with a missing key", () => {
    const handler = createEmailPreviewsHandler({ renderPreviews: vi.fn() });
    const res = mockRes();
    handler(reqWithKey(undefined), res);
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 always when ADMIN_API_KEY is unset (never public)", () => {
    delete process.env.ADMIN_API_KEY;
    const handler = createEmailPreviewsHandler({ renderPreviews: vi.fn() });
    const res = mockRes();
    handler(reqWithKey(""), res);
    expect(res.statusCode).toBe(401);
  });
});

describe("createEmailPreviewsHandler success and failure", () => {
  it("authorized → 200 with the rendered templates and SMS previews", () => {
    const previews = [{ name: "welcome", brand: "gold" as const, html: "<html>x</html>" }];
    const sms = [{ name: "cardDeclined", text: "Hi Sample Preview..." }];
    const handler = createEmailPreviewsHandler({
      renderPreviews: () => previews,
      renderSmsPreviews: () => sms,
    });
    const res = mockRes();
    handler(reqWithKey("test-admin-key"), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ templates: previews, sms });
  });

  it("falls back to the real SMS registry when no SMS renderer is injected", () => {
    const previews = [{ name: "welcome", brand: "gold" as const, html: "<html>x</html>" }];
    const handler = createEmailPreviewsHandler({ renderPreviews: () => previews });
    const res = mockRes();
    handler(reqWithKey("test-admin-key"), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.templates).toEqual(previews);
    expect(Array.isArray(res.body.sms)).toBe(true);
    expect(res.body.sms.length).toBeGreaterThan(0);
  });

  it("renderer throw → 500 with a generic message (no detail leak)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createEmailPreviewsHandler({
      renderPreviews: () => {
        throw new Error("secret internal detail");
      },
    });
    const res = mockRes();
    handler(reqWithKey("test-admin-key"), res);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
    spy.mockRestore();
  });
});

describe("renderAllEmailPreviews", () => {
  it("covers every EMAIL_TEMPLATES entry with sample-data HTML", () => {
    const previews = renderAllEmailPreviews();
    const registryNames = Object.keys(EMAIL_TEMPLATES).sort();
    expect(previews.map((p) => p.name).sort()).toEqual(registryNames);
    for (const p of previews) {
      expect(EMAIL_TEMPLATES[p.name].brand).toBe(p.brand);
      expect(p.html.length).toBeGreaterThan(0);
      // leadWelcome's copy is fixed (it doesn't interpolate the recipient),
      // so the probe only appears in the other templates.
      if (p.name === "leadWelcome") continue;
      // cardDeclined greets by FIRST name, so the probe arrives truncated to
      // its first token rather than the full "Sample Preview".
      if (p.name === "cardDeclined") {
        expect(p.html).toContain(SAMPLE_PROBE.split(" ")[0]);
      } else {
        expect(p.html).toContain(SAMPLE_PROBE);
      }
    }
  });
});

describe("renderAllSmsPreviews", () => {
  it("covers every SMS_TEMPLATES entry with sample-data text", () => {
    const previews = renderAllSmsPreviews();
    const registryNames = Object.keys(SMS_TEMPLATES).sort();
    expect(previews.map((p) => p.name).sort()).toEqual(registryNames);
    for (const p of previews) {
      expect(p.text.length).toBeGreaterThan(0);
      // SMS copy greets by FIRST name, so the probe arrives truncated to its
      // first token ("Sample") rather than the full "Sample Preview".
      expect(p.text).toContain(SAMPLE_PROBE.split(" ")[0]);
      // A2P 10DLC: the mandatory opt-out line must survive any copy edit.
      expect(p.text).toContain("Reply STOP to opt out.");
    }
  });
});

describe("routes.ts wiring", () => {
  it("registers GET /api/internal/email-previews via createEmailPreviewsHandler", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "routes.ts"), "utf8");
    expect(src).toMatch(
      /app\.get\(\s*["']\/api\/internal\/email-previews["']\s*,\s*createEmailPreviewsHandler\(\)\s*\)/,
    );
    expect(src).toContain('from "./emailPreviewRoute"');
  });
});
